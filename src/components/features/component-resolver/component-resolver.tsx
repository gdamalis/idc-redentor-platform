import React from 'react';
import { ComponentCta } from '../component-cta';

export type ContentfulComponent = {
  __typename: string;
  [key: string]: unknown;
};

export function resolveComponent(component: ContentfulComponent | null): React.ReactNode {
  if (!component || !component.__typename) {
    return null;
  }

  switch (component.__typename) {
    case 'ComponentCta':
      // Type assertion is necessary here as we know the structure matches
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return <ComponentCta content={component as any} />;
    default:
      console.warn(`Component type '${component.__typename}' is not implemented`);
      return null;
  }
}

export function resolveComponents(components: ContentfulComponent[] | null): React.ReactNode {
  if (!components || !Array.isArray(components) || components.length === 0) {
    return null;
  }

  return components.map((component, index) => (
    <div key={`component-${index}-${component.__typename}`}>
      {resolveComponent(component)}
    </div>
  ));
} 