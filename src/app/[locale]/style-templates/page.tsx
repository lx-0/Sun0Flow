import { redirect } from "next/navigation";

export default function StyleTemplatesPage() {
  redirect("/templates?tab=styles");
}
