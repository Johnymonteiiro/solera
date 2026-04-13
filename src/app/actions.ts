"use server"

import { redirect } from "next/navigation"
import { deleteSession } from "@/lib/sessions"

export async function logout() {
  await deleteSession()
  redirect("/login")
}
