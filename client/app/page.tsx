import Link from "next/link";

/**
 * The real application has not been built yet — Phase 1 is design. Until a
 * screen is approved and graduates out of /mockups, this is just a signpost.
 */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-center gap-4 px-4 py-16">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
        01219346 · Kasetsart University
      </p>
      <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-ink">
        BMA IT procurement discovery platform
      </h1>
      <p className="text-[14px] leading-thai text-ink-2">
        แพลตฟอร์มค้นหาและอ่านประกาศจัดซื้อจัดจ้างไอทีของกรุงเทพมหานคร ขณะนี้อยู่ในระยะออกแบบ
        ยังไม่มีการต่อฐานข้อมูลหรือตัวเก็บข้อมูล
      </p>
      <Link
        href="/mockups"
        className="inline-flex h-9 w-fit items-center rounded-[3px] bg-ink px-3.5 text-[13px] font-medium text-surface transition-opacity hover:opacity-85"
      >
        View the Phase 1 mockups →
      </Link>
    </main>
  );
}
