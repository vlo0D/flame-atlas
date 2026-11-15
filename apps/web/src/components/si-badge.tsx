/**
 * Marks text or a value that a language model produced ("SI" is the challenge's word for AI).
 * Whatever carries this badge is also checked by code against its source; the title says how.
 */
export function SiBadge({ title }: { title: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center rounded-full bg-accent px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase leading-none tracking-wide text-accent-fg"
    >
      SI
    </span>
  );
}
