/**
 * Shared page frame: title + one-line description of the SDK function on the left,
 * controls (usually the language picker) on the right, content below.
 */
export default function Screen({
  title,
  desc,
  actions,
  children,
}: {
  title: string;
  desc: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="screen">
      <header className="phead">
        <div>
          <h1>{title}</h1>
          <p className="desc">{desc}</p>
        </div>
        {actions ? <div className="phead-actions">{actions}</div> : null}
      </header>
      <div className="pbody">{children}</div>
    </section>
  );
}
