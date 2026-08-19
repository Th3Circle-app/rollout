"""SSRF-safe outbound fetch, shared by every server-side URL fetch.

- allowlist http/https only
- reject private / loopback / link-local / metadata / reserved IPs
- PIN the validated IP for the actual connection so DNS can't rebind between
  the check and the fetch (resolve once, validate, connect to that IP)
- cap the response size
- do NOT follow redirects (a redirect to an internal URL would re-open SSRF)
"""
import http.client
import ipaddress
import socket
import ssl
from urllib.parse import urlparse

_MAX_BYTES = 25 * 1024 * 1024
_TIMEOUT = 20


# Ranges the stdlib flags don't cover but that reach cloud metadata / internal
# infra. 100.64.0.0/10 (CGNAT) contains Alibaba Cloud metadata 100.100.100.200.
_DENY_NETS = (
    ipaddress.ip_network("100.64.0.0/10"),   # CGNAT / RFC 6598
    ipaddress.ip_network("192.0.0.0/24"),    # IETF protocol assignments
    ipaddress.ip_network("198.18.0.0/15"),   # benchmarking
)
_ALLOWED_PORTS = frozenset({80, 443})


def _bad_ip(ipstr: str) -> bool:
    ip = ipaddress.ip_address(ipstr)
    # unwrap ::ffff:a.b.c.d so the v4 checks apply even on older interpreters
    # where IPv6Address.is_private returned False for mapped addresses
    if ip.version == 6 and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    if (ip.is_private or ip.is_loopback or ip.is_link_local
            or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
        return True
    return any(ip in net for net in _DENY_NETS)


def assert_public_url(url: str):
    """Validate + return (hostname, port, scheme, validated_ip). Raises ValueError."""
    p = urlparse(url)
    if p.scheme not in ("http", "https"):
        raise ValueError("only http/https URLs are allowed")
    host = p.hostname
    if not host:
        raise ValueError("missing host")
    port = p.port or (443 if p.scheme == "https" else 80)
    if port not in _ALLOWED_PORTS:
        raise ValueError("only ports 80/443 are allowed")
    try:
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise ValueError("host does not resolve")
    if not infos:
        raise ValueError("host does not resolve")
    for info in infos:
        if _bad_ip(info[4][0]):
            raise ValueError("refusing to fetch a non-public address")
    return host, port, p.scheme, infos[0][4][0]


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host, ip, **kw):
        super().__init__(host, **kw)
        self._ip = ip

    def connect(self):
        self.sock = socket.create_connection((self._ip, self.port), self.timeout)
        self.sock = self._context.wrap_socket(self.sock, server_hostname=self.host)


class _PinnedHTTPConnection(http.client.HTTPConnection):
    def __init__(self, host, ip, **kw):
        super().__init__(host, **kw)
        self._ip = ip

    def connect(self):
        self.sock = socket.create_connection((self._ip, self.port), self.timeout)


def fetch_url(url: str, timeout: int = _TIMEOUT, max_bytes: int = _MAX_BYTES,
              headers: dict | None = None) -> bytes:
    host, port, scheme, ip = assert_public_url(url)
    p = urlparse(url)
    path = p.path or "/"
    if p.query:
        path += "?" + p.query
    if scheme == "https":
        conn = _PinnedHTTPSConnection(host, ip, port=port, timeout=timeout,
                                      context=ssl.create_default_context())
    else:
        conn = _PinnedHTTPConnection(host, ip, port=port, timeout=timeout)
    hdrs = {"User-Agent": "Mozilla/5.0", "Accept": "*/*"}
    if headers:
        hdrs.update(headers)
    try:
        conn.request("GET", path, headers=hdrs)
        resp = conn.getresponse()
        if resp.status >= 300:  # no redirects, no errors — image endpoints return 200
            raise ValueError(f"fetch failed: HTTP {resp.status}")
        return resp.read(max_bytes + 1)[:max_bytes]
    finally:
        conn.close()


def post_json(url: str, body: bytes, headers: dict | None = None,
              timeout: int = _TIMEOUT, max_bytes: int = _MAX_BYTES) -> bytes:
    """Same IP-pinned, SSRF-safe path as fetch_url, for a JSON POST (BYO custom
    providers). Resolve+validate once, connect to the pinned IP."""
    host, port, scheme, ip = assert_public_url(url)
    p = urlparse(url)
    path = p.path or "/"
    if p.query:
        path += "?" + p.query
    if scheme == "https":
        conn = _PinnedHTTPSConnection(host, ip, port=port, timeout=timeout,
                                      context=ssl.create_default_context())
    else:
        conn = _PinnedHTTPConnection(host, ip, port=port, timeout=timeout)
    hdrs = {"User-Agent": "Mozilla/5.0", "Content-Type": "application/json"}
    if headers:
        hdrs.update(headers)
    try:
        conn.request("POST", path, body=body, headers=hdrs)
        resp = conn.getresponse()
        if resp.status >= 300:
            # Surface the provider's own explanation (quota/billing/bad-key detail)
            # instead of a bare status — otherwise every failure looks identical.
            detail = ""
            try:
                detail = resp.read(2048).decode("utf-8", "replace").strip().replace("\n", " ")
            except Exception:
                pass
            raise ValueError(f"post failed: HTTP {resp.status}{(' — ' + detail) if detail else ''}")
        return resp.read(max_bytes + 1)[:max_bytes]
    finally:
        conn.close()
