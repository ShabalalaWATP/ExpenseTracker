import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { ExpenseApp } from "./components/ExpenseApp";

export default function Home() {
  return (
    <AppErrorBoundary>
      <ExpenseApp />
    </AppErrorBoundary>
  );
}
