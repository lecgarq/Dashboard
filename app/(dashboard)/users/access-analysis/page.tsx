import { redirect } from "next/navigation";

// The graph moved to /users/spatial-graph (the "Spatial Graph" nav item). This
// route forwards there so existing links/bookmarks keep working.
export default function Page(): never {
  redirect("/users/spatial-graph");
}
