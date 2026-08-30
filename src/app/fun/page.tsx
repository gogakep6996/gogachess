import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { FunClient } from './FunClient';

export const metadata: Metadata = {
  title: 'Развлекательные шахматы — gogachess',
  description:
    'Сказочные шахматы для детей: армия Света против армии Тьмы, боевые анимации и игра против дракона-компьютера.',
};

export default function FunPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
        <FunClient />
      </main>
    </>
  );
}
