import { FirebaseError } from "firebase/app";

const firebaseProjectId =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "your-project";

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
  if (!(error instanceof FirebaseError)) {
    return "Something went wrong. Try again.";
  }

  switch (error.code) {
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/weak-password":
      return "Password must be at least 8 characters.";
    case "auth/too-many-requests":
      return "Too many attempts. Try again later.";
    case "auth/popup-closed-by-user":
      return "Sign-in was cancelled.";
    case "auth/configuration-not-found":
      return `Firebase Authentication is not set up for ${firebaseProjectId} yet. Enable Email/Password and Google in the Firebase Console.`;
    default:
      return error.message;
  }
}