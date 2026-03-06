import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import StatusBar from "@/components/layout/StatusBar";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-base)" }}>
      <Navbar user={session.user} />
      <main className="flex-1 pb-16">
        {children}
      </main>
      <StatusBar userId={session.user.id} />
    </div>
  );
}
