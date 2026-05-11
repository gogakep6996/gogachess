import { Header } from '@/components/layout/Header';
import { AnalysisClient } from './AnalysisClient';

export default function AnalysisPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
        <AnalysisClient />
      </main>
    </>
  );
}
