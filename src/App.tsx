import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { Skeleton } from "@/components/ui/skeleton";
import AppLayout from "@/components/AppLayout";
import { AccessGate } from "@/components/AccessGate";
import { SplashScreen } from "@/components/SplashScreen";
import { useAccess } from "@/hooks/useAccess";
import Dashboard from "@/pages/Dashboard";
import NotFound from "@/pages/NotFound";

const Games = lazy(() => import("@/pages/Games"));
const BookingDetail = lazy(() => import("@/pages/BookingDetail"));
const Profile = lazy(() => import("@/pages/Profile"));

function PageFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-56" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

export default function App() {
  const { hasChosen } = useAccess();

  if (!hasChosen) {
    return (
      <>
        <SplashScreen />
        <AccessGate />
        <Toaster position="bottom-right" richColors closeButton />
      </>
    );
  }

  return (
    <>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route
            path="/games"
            element={
              <Suspense fallback={<PageFallback />}>
                <Games />
              </Suspense>
            }
          />
          <Route
            path="/bookings/:id"
            element={
              <Suspense fallback={<PageFallback />}>
                <BookingDetail />
              </Suspense>
            }
          />
          <Route
            path="/profile"
            element={
              <Suspense fallback={<PageFallback />}>
                <Profile />
              </Suspense>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      <SplashScreen />
      <Toaster position="bottom-right" richColors closeButton />
    </>
  );
}
