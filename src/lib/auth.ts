export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export type SignInFieldErrors = {
  email?: string;
  password?: string;
};

export type SignUpFieldErrors = {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
};

export function validateSignInForm(values: {
  email: string;
  password: string;
}): SignInFieldErrors {
  const errors: SignInFieldErrors = {};
  const email = values.email.trim();
  const password = values.password.trim();

  if (!email) {
    errors.email = "Email is required.";
  } else if (!isValidEmail(email)) {
    errors.email = "Enter a valid email address.";
  }

  if (!password) {
    errors.password = "Password is required.";
  }

  return errors;
}

export function validateSignUpForm(values: {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}): SignUpFieldErrors {
  const errors: SignUpFieldErrors = {};
  const email = values.email.trim();
  const password = values.password.trim();
  const confirmPassword = values.confirmPassword.trim();
  const name = values.name.trim();

  if (!name) {
    errors.name = "Name is required.";
  }

  if (!email) {
    errors.email = "Email is required.";
  } else if (!isValidEmail(email)) {
    errors.email = "Enter a valid email address.";
  }

  if (!password) {
    errors.password = "Password is required.";
  } else if (password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
  }

  if (!confirmPassword) {
    errors.confirmPassword = "Confirm your password.";
  } else if (password !== confirmPassword) {
    errors.confirmPassword = "Passwords do not match.";
  }

  return errors;
}

export function validateForgotPasswordForm(email: string) {
  const trimmed = email.trim();
  if (!trimmed) return "Email is required.";
  if (!isValidEmail(trimmed)) return "Enter a valid email address.";
  return null;
}

export function getAuthErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") {
    return "Something went wrong. Try again.";
  }

  const code = "code" in error ? String(error.code) : "";
  const message =
    "message" in error ? String(error.message) : "Something went wrong. Try again.";

  switch (code) {
    case "auth/invalid-email":
    case "invalid_email":
      return "Enter a valid email address.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "invalid_credentials":
      return "Incorrect email or password.";
    case "auth/email-already-in-use":
    case "user_already_exists":
      return "An account with this email already exists.";
    case "email_not_confirmed":
      return "Confirm your email first. Check your inbox for the verification link.";
    case "auth/weak-password":
    case "weak_password":
      return "Password must be at least 8 characters.";
    case "auth/too-many-requests":
    case "over_request_rate_limit":
    case "email_rate_limit_exceeded":
      return "Too many email attempts. Wait a few minutes, then try again.";
    case "auth/popup-closed-by-user":
      return "Sign-in was cancelled.";
    default:
      if (message.toLowerCase().includes("email not confirmed")) {
        return "Confirm your email first. Check your inbox for the verification link.";
      }
      if (message.toLowerCase().includes("invalid login credentials")) {
        return "Incorrect email or password.";
      }
      if (message.toLowerCase().includes("rate limit")) {
        return "Too many email attempts. Wait a few minutes, then try again.";
      }
      if (message.toLowerCase().includes("service_role_key")) {
        return "Server auth is not configured. Add SUPABASE_SERVICE_ROLE_KEY to .env.local.";
      }
      if (message.toLowerCase().includes("resend_api_key")) {
        return "Email delivery is not configured. Add RESEND_API_KEY to .env.local.";
      }
      return message;
  }
}
