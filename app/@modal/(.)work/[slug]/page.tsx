import { notFound } from 'next/navigation';
import Modal from '@/components/Modal';
import ArtworkDetail from '@/components/ArtworkDetail';
import { getArtworkBySlug } from '@/lib/artworks';

export default async function InterceptedWorkModal({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const artwork = getArtworkBySlug(slug);
  if (!artwork) notFound();

  return (
    <Modal>
      <ArtworkDetail artwork={artwork} />
    </Modal>
  );
}
