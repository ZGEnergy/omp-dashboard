import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  children: ReactNode;
}

export function DialogPortal({ children }: Props) {
  const prevOverflow = useRef<string>("");

  useEffect(() => {
    prevOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow.current;
    };
  }, []);

  return createPortal(children, document.body);
}
