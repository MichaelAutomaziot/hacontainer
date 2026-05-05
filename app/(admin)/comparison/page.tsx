"use client";

import { Suspense } from "react";
import { RouteLoading } from "@/components/shared/RouteLoading";
import PageClient from "./PageClient";

export default function Page() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <PageClient />
    </Suspense>
  );
}
