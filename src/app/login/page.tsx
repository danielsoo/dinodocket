import type { Metadata } from "next";
import AuthForm from "@/components/AuthForm";

export const metadata: Metadata = { title: "Log in · DinoDocket" };

export default function LoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-11rem)] items-center py-4">
      <AuthForm mode="login" />
    </div>
  );
}
