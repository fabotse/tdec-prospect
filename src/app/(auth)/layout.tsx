export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-[400px] p-8 bg-background-secondary border border-border rounded-lg">
        {children}
      </div>
    </div>
  );
}
