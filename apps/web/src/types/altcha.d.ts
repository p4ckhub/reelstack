import type React from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'altcha-widget': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        challengeurl?: string;
      };
    }
  }
}
