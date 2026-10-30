import React from "react";
import { Composition } from "remotion";
import { Main, TOTAL } from "./Main";

export const Root: React.FC = () => (
  <Composition id="Main" component={Main} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />
);
