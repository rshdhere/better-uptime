import { z } from "zod";

export const userInputValidation = z
  .object({
    email: z
      .email({ message: "email-id should be valid" })
      .min(5, { message: "email should have atleast 05 charachters" })
      .max(40, { message: "email shouldn't have more than 50 charachters" }),

    password: z
      .string()
      .min(8, { message: "passwords should be atleast 08 charachters" })
      .max(24, { message: "passwords shouldn't be more that 24 charachters" })
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/,
        {
          message:
            "password must contain at least one upper-case letter, one lower-case letter, a number, and a special-character",
        },
      ),
  })
  .strict();

export const userOutputValidation = z.object({
  token: z.string(),
});

// GitHub OAuth input validation
export const githubAuthInput = z.object({
  code: z.string().min(1, "Authorization code is required"),
  state: z.string().optional(),
});

// Signup output validation (returns message instead of token)
export const signupOutputValidation = z.object({
  message: z.string(),
  email: z.email(),
});

export const verifyEmailInput = z.object({
  token: z.string().min(1, "Token is required"),
});

export const resendVerificationInput = z.object({
  email: z.string().email(),
});

export const resendVerificationOutput = z.object({
  message: z.string(),
});

export const meOutput = z.object({
  id: z.string(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

export const websiteResponse = z.object({
  message: z.string(),
  //TODO: needs to be updated when clickhouse is integrated, right now it says website was stored in the database
});

export const websiteRegisterInputValidation = z.object({
  url: z.url("Invalid Url"),
});
