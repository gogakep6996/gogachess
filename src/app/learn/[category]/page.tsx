import { notFound } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { getCategory } from '@/lib/training';
import { TrainerClient } from './TrainerClient';

export default async function TrainingCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const cat = getCategory(category);
  if (!cat) return notFound();

  return (
    // Как в комнате: на десктопе страница занимает ровно высоту окна,
    // без прокрутки — доска масштабируется под доступное место.
    <div className="flex min-h-dvh flex-col overscroll-none bg-surface dark:bg-surface-dark lg:h-dvh lg:overflow-hidden">
      <div className="shrink-0">
        <Header />
      </div>
      <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col px-2 pb-2 pt-2 sm:px-3 lg:min-h-0 lg:overflow-hidden">
        <TrainerClient category={cat.id} title={cat.title} />
      </main>
    </div>
  );
}
