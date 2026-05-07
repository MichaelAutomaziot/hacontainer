import { redirect } from "next/navigation";

// Middleware already gates the session for `/`. By the time we get here we
// have one — go straight to the dashboard. No client-side JS, no spinner.
export default function HomePage() {
  redirect("/board/upload");
}
