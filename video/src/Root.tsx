import React from "react";
import { Composition } from "remotion";
import { Chart, Cover, Main, TOTAL } from "./Main";

export const Root: React.FC = () => (
  <>
    <Composition id="Main" component={Main} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />
    <Composition id="Cover" component={Cover} durationInFrames={1} fps={30} width={2000} height={840} />
    <Composition id="Chart" component={Chart} durationInFrames={1} fps={30} width={1600} height={840} />
  </>
);
