import { Composition } from "remotion";
import { LyricVideo, LyricProps, FPS } from "./LyricVideo";

const DEFAULT: LyricProps = {
  title: "FAIL SAFE",
  artist: "XKAII",
  durationSec: 15,
  audioFile: "clip.wav",
  coverFile: "cover.jpg",
  words: [
    { word: "I'm", start: 0.14, end: 0.56 },
    { word: "looking", start: 0.56, end: 0.98 },
    { word: "at", start: 0.98, end: 1.2 },
    { word: "you", start: 1.2, end: 1.46 },
  ],
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="LyricVideo"
      component={LyricVideo}
      durationInFrames={15 * FPS}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={DEFAULT}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.round((props.durationSec ?? 15) * FPS),
        props,
      })}
    />
  );
};
