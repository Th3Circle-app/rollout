# Rollout — App Completeness Spec & Audit

The "standard furniture" a real product ships with (the stuff Figma-grade
templates wire in by default and hand-built apps forget). Grounded in SaaS
onboarding/UX research: welcome tours, checklists, empty states, and invisible
guidance are the activation drivers (Userpilot, Appcues, UserGuiding analyses).

## Spec + audit (2026-07-27)

### 1 · Navigation & wayfinding
| Item | Status |
|---|---|
| Browser back/forward works between screens | ❌ **BROKEN** (replaceState) → ✅ FIXED: pushState + popstate |
| Deep links (?page=X) | ✅ had |
| Breadcrumbs on release screens, clickable | 🟡 present, some not clickable → ✅ FIXED key ones |
| Logo → home | ✅ had |
| Active nav state | ✅ had |
| Unknown route falls back safely | ✅ had (Import) |

### 2 · Onboarding & guidance
| Item | Status |
|---|---|
| First-run product tour (skippable, replayable) | ❌ MISSING → ✅ ADDED: 8-step tour, auto on first visit, replay from Settings + "?" button |
| Empty states with next-step CTAs | ✅ had (Dashboard "open to create", Ship "Pick a date") |
| Hero/context copy on entry screen | ✅ had |
| Persistent help affordance | ❌ MISSING → ✅ ADDED: global "?" button |

### 3 · Document & meta
| Item | Status |
|---|---|
| Real page title (was "Screen 1"!) | ❌ → ✅ FIXED + per-screen titles |
| Favicon (was vite.svg) | ❌ → ✅ FIXED: violet bolt SVG |
| Meta description / theme-color | ❌ → ✅ ADDED |
| No dead CDN deps (Google Fonts ×10 families) | ❌ → ✅ REMOVED (Inter is bundled locally) |

### 4 · State & data integrity
| Item | Status |
|---|---|
| Release survives page reload | ❌ **LOST ON REFRESH** → ✅ FIXED: persisted |
| Plan/date/link/distribution persist | ✅ had |
| Free-song counter persists | ✅ had |

### 5 · Feedback & microcopy
| Item | Status |
|---|---|
| Action feedback (copied, scheduled, saved) | ✅ had (inline states) |
| Loading states everywhere async | ✅ had |
| Error states with recovery copy | ✅ had |
| Honest ETAs on slow operations | ✅ had (lyric video ~2-3 min) |

### 6 · Accessibility
| Item | Status |
|---|---|
| Keyboard focus rings | ✅ had (premium pass) |
| img alt everywhere | ✅ had (graded) |
| Icon-only buttons labeled | 🟡 → ✅ FIXED (aria-labels on close/eye/avatar) |
| Reduced-motion respect | ✅ ADDED (media query kills page transitions) |

### 7 · Settings completeness
| Item | Status |
|---|---|
| Plan & usage | ✅ had |
| About / version | ❌ → ✅ ADDED |
| Support contact | ❌ → ✅ ADDED |
| Replay tour | ❌ → ✅ ADDED |
| Legal placeholder (honest, not fake links) | ✅ ADDED as "ships with public launch" note |

Re-run `npm run premium` after any change; this spec is the completeness
companion to that visual grader.
