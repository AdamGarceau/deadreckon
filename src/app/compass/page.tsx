"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CompassRedirect() {
  const r = useRouter();
  useEffect(() => {
    r.replace("/coordinates/");
  }, [r]);
  return null;
}
