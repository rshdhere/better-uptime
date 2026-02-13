"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { GITHUB_OAUTH_URL, FRONTEND_URL } from "@repo/config/constants";
import { Button } from "@/components/Button";

function getErrorMessage(error: { message: string }): string {
  try {
    const parsed = JSON.parse(error.message);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].message) {
      return parsed[0].message;
    }
  } catch {
    // Not JSON, return as-is
  }
  return error.message;
}

function handleGitHubLogin() {
  // Generate state for CSRF protection
  const state = crypto.randomUUID();
  sessionStorage.setItem("oauth_state", state);

  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || "",
    redirect_uri: `${FRONTEND_URL}/api/auth/github/callback`,
    scope: "read:user user:email",
    state,
  });

  window.location.href = `${GITHUB_OAUTH_URL}?${params.toString()}`;
}

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationSent, setVerificationSent] = useState(false);
  const [sentToEmail, setSentToEmail] = useState("");

  const signup = trpc.user.signup.useMutation({
    onSuccess: (data) => {
      setSentToEmail(data.email);
      setVerificationSent(true);
      toast.success("Check your email", {
        description: data.message,
      });
    },
    onError: (err) => {
      toast.error("Sign up failed", {
        description: getErrorMessage(err),
      });
    },
  });

  const resendVerification = trpc.user.resendVerification.useMutation({
    onSuccess: () => {
      toast.success("Verification email sent", {
        description: "Please check your inbox",
      });
    },
    onError: (err) => {
      toast.error("Failed to resend", {
        description: getErrorMessage(err),
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    signup.mutate({ email, password });
  };

  const handleResend = () => {
    resendVerification.mutate({ email: sentToEmail });
  };

  const resendToastShown = useRef(false);

  useEffect(() => {
    if (verificationSent && !resendToastShown.current) {
      resendToastShown.current = true;
      const timer = setTimeout(() => {
        toast("Didn't receive the email?", {
          description: "Check your spam folder or click here",
          duration: Infinity,
          action: {
            label: "Resend",
            onClick: handleResend,
          },
        });
      }, 10000);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verificationSent, sentToEmail]);

  // Show verification sent screen
  if (verificationSent) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center">
            <svg
              className="h-10 w-10 animate-spin text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">Check your email</h1>
            <p className="text-sm text-muted-foreground">
              We&apos;ve sent a verification link to{" "}
              <span className="font-medium text-foreground">{sentToEmail}</span>
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            Click the link in the email to verify your account. The link will
            expire in 24 hours.
          </p>

          <p className="text-center text-sm text-muted-foreground">
            <Link
              href="/login"
              className="font-medium text-foreground hover:underline"
            >
              Back to login
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">Create an account</h1>
          <p className="text-sm text-muted-foreground">
            Enter your details to get started
          </p>
        </div>

        {/* GitHub OAuth Button */}
        <Button
          type="button"
          onClick={handleGitHubLogin}
          variant="secondary"
          className="flex w-full items-center justify-center gap-2"
        >
          <svg
            className="h-5 w-5"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              clipRule="evenodd"
            />
          </svg>
          Continue with GitHub
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              Or continue with email
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
            />
            <p className="text-xs text-muted-foreground">
              8-24 chars, uppercase, lowercase, number, special char
            </p>
          </div>

          <Button type="submit" disabled={signup.isPending} className="w-full">
            {signup.isPending ? "Creating account..." : "Sign up"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground hover:underline"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
