import React from 'react';

import { Container } from '../container';
import { Typography } from '../typography/Typography';

type ContentProps = {
  title?: React.ReactNode;
  body?: React.ReactNode;
  className?: string;
};

export const Content = ({ title, body, className }: ContentProps) => {
  return (
    <Container className={`py-16 text-center sm:py-24 ${className}`}>
      {title && (
        <Typography component="h1" variant="h1" className="">
          {title}
        </Typography>
      )}
      {body}
    </Container>
  );
};
