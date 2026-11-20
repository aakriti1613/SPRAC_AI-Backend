// Minimal stand-in for React's types so the contract check runs without
// installing React in the backend. Real shells/components use @types/react.
declare module "react" {
  export type ReactNode = string | number | boolean | null | undefined | object;
}
