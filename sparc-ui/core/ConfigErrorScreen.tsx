// Shown instead of the site when its config has mistakes, so problems are
// visible and specific instead of a blank page.
export function ConfigErrorScreen({ errors }: { errors: string[] }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-xl font-semibold text-danger">This site's configuration has problems</h1>
      <p className="mt-2 text-sm text-muted">Fix these in src/sparc.config.json and reload:</p>
      <ul className="mt-4 list-disc space-y-1 pl-6 text-sm" data-testid="config-errors">
        {errors.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </main>
  );
}
