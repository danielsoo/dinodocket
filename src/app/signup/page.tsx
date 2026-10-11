import type { Metadata } from "next";
import AuthForm from "@/components/AuthForm";

export const metadata: Metadata = { title: "Sign up · DinoDocket" };

export default function SignupPage() {
  return (
    <div className="flex min-h-[calc(100vh-11rem)] items-center py-4">
      <AuthForm mode="signup" />
    </div>
  );
}
