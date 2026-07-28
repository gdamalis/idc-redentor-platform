# @idcr/ui

## 0.0.1

### Patch Changes

- 6b3bfad: Fix `--destructive`'s WCAG AA contrast: darken the light button pair (was 3.59:1) and add a
  dedicated `--destructive-text` token, safe as small foreground text in both themes (field errors,
  destructive menu items), since `--destructive` itself was designed as a background-only token.
