import { LoginForm } from "./login-form";

interface LoginPageProps {
  readonly searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { callbackUrl } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <LoginForm callbackUrl={callbackUrl} />
    </div>
  );
}
