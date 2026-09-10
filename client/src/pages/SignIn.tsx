import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, ScanLine } from "lucide-react";

import { Button } from "../components/ui/button";
import { Field, Input } from "../components/ui/Field";
import { useSignIn } from "../lib/auth";
import { spring, useSpring } from "../lib/motion";

export default function SignIn() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const signIn = useSignIn();
  const transition = useSpring(spring);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    signIn.mutate({ username: username.trim(), password });
  };

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-bg px-4 py-10">
      {/* A single soft light source behind the card, low enough not to compete
          with the form. Not animated: a slow looping background is exactly the
          kind of motion that makes people ill. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px] max-w-[140vw] -translate-x-1/2 -translate-y-1/3 rounded-full bg-accent/[0.12] blur-3xl"
      />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition}
        className="relative w-full max-w-[22rem]"
      >
        <div className="mb-7 text-center">
          <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-lg bg-accent text-ink-on-accent shadow-md">
            <ScanLine className="h-6 w-6" />
          </span>
          <h1 className="text-title text-ink">Phone Inspection</h1>
          <p className="text-caption text-ink-secondary mt-1">
            Wholesale device intake, grading and reporting
          </p>
        </div>

        <div className="material-panel rounded-xl p-5 shadow-md">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Username">
              {(props) => (
                <Input
                  {...props}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  autoFocus
                  required
                />
              )}
            </Field>

            <Field
              label="Password"
              error={signIn.isError ? (signIn.error as Error).message : undefined}
            >
              {(props) => (
                <Input
                  {...props}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              )}
            </Field>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={signIn.isPending || !username.trim() || !password}
            >
              {signIn.isPending ? "Signing in" : "Sign in"}
              {!signIn.isPending && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>
        </div>

        <p className="text-caption text-ink-tertiary mt-4 text-center leading-relaxed">
          This is a demo build. Any username and password opens a session with five
          sample orders already loaded.
        </p>
      </motion.div>
    </div>
  );
}
