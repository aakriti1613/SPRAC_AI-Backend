// Login, sign-up and forgot-password pages (rooms: login, signup, forgot-password).
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Slot } from "@core/slots";
import { messageOf, usePortal, useSession } from "../logic/portal";

export function LoginPage() {
  const { config, brand, enabled } = usePortal();
  const { user, signIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  if (user) return <Navigate to={from} replace />;

  return (
    <Slot
      room="login"
      props={{
        brand,
        badge: config.loginPage.badge,
        headline: config.loginPage.headline,
        description: config.loginPage.description,
        features: config.loginPage.features,
        submitting,
        error,
        signupHref: enabled.has("signup") ? "/signup" : undefined,
        forgotPasswordHref: enabled.has("forgot-password") ? "/forgot-password" : undefined,
        onSubmit: async (email, password) => {
          setSubmitting(true);
          setError(undefined);
          try {
            await signIn(email, password);
            navigate(from, { replace: true });
          } catch (e) {
            setError(messageOf(e));
          } finally {
            setSubmitting(false);
          }
        },
      }}
    />
  );
}

export function SignupPage() {
  const { brand } = usePortal();
  const { user, signUp } = useSession();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  if (user) return <Navigate to="/" replace />;
  return (
    <Slot
      room="signup"
      props={{
        brand,
        submitting,
        error,
        loginHref: "/login",
        onSubmit: async (values) => {
          setSubmitting(true);
          setError(undefined);
          try {
            const result = await signUp(values);
            if (result === "confirm-email") setError("Check your inbox to confirm your email, then log in.");
            else navigate("/", { replace: true });
          } catch (e) {
            setError(messageOf(e));
          } finally {
            setSubmitting(false);
          }
        },
      }}
    />
  );
}

export function ForgotPasswordPage() {
  const { brand } = usePortal();
  const { resetPassword } = useSession();
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <Slot
      room="forgot-password"
      props={{
        brand,
        submitting,
        sent,
        error,
        loginHref: "/login",
        onSubmit: async (email) => {
          setSubmitting(true);
          setError(undefined);
          try {
            await resetPassword(email);
            setSent(true);
          } catch (e) {
            setError(messageOf(e));
          } finally {
            setSubmitting(false);
          }
        },
      }}
    />
  );
}
