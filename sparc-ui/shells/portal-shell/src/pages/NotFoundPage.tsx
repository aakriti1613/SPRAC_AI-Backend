import { Slot } from "@core/slots";

export function NotFoundPage() {
  return (
    <Slot
      room="not-found"
      props={{ title: "Page not found", message: "The page you are looking for does not exist or was moved.", homeHref: "/" }}
    />
  );
}
