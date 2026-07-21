import React from 'react';
import {Composition} from 'remotion';
import {Hook} from './Hook';
import './styles.css';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Hook"
      component={Hook}
      durationInFrames={540}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
