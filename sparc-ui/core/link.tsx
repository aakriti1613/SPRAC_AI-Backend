// Link for components: in-app paths navigate without a page reload; anchors,
// external links, mailto: and tel: use a normal <a>. Components never import
// the router directly, so they work in any shell.
import type { ReactNode } from "react";
import { Link, useInRouterContext } from "react-router-dom";

const EXTERNAL = /^(https?:|mailto:|tel:|#|\/\/)/i;

export function SparcLink({
  href,
  className,
  children,
  ariaLabel,
  onClick,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
  onClick?: () => void;
}) {
  const inRouter = useInRouterContext();
  if (!inRouter || EXTERNAL.test(href)) {
    const external = /^https?:|^\/\//i.test(href);
    return (
      <a href={href} className={className} aria-label={ariaLabel} onClick={onClick} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
        {children}
      </a>
    );
  }
  return (
    <Link to={href} className={className} aria-label={ariaLabel} onClick={onClick}>
      {children}
    </Link>
  );
}
