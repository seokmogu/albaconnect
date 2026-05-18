import { copy } from "../_content/copy"

export function Pricing() {
  const { sectionTitle, headline, subheadline, comparisonRows, note } = copy.pricing

  return (
    <section
      id="pricing"
      className="bg-surface py-24 sm:py-32"
      aria-labelledby="pricing-title"
    >
      <div className="mx-auto max-w-5xl px-6">
        <p className="text-sm font-semibold tracking-wide text-primary">
          {sectionTitle}
        </p>
        <h2
          id="pricing-title"
          className="mt-3 text-3xl font-bold tracking-tight text-text-primary sm:text-5xl"
          style={{ wordBreak: "keep-all" }}
        >
          {headline}
        </h2>
        <p
          className="mt-4 max-w-2xl text-base text-text-secondary sm:text-lg"
          style={{ wordBreak: "keep-all" }}
        >
          {subheadline}
        </p>

        <div className="mt-12 overflow-hidden rounded-xl border border-border bg-white">
          <table className="w-full text-left text-sm sm:text-base">
            <thead className="border-b border-border bg-surface text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-4 font-semibold sm:px-6">
                  플랫폼
                </th>
                <th scope="col" className="px-4 py-4 font-semibold sm:px-6">
                  비용
                </th>
                <th
                  scope="col"
                  className="hidden px-4 py-4 font-semibold sm:table-cell sm:px-6"
                >
                  비고
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {comparisonRows.map((row) => (
                <tr
                  key={row.label}
                  className={
                    row.highlight
                      ? "bg-primary/5"
                      : "bg-white"
                  }
                >
                  <td className="px-4 py-5 sm:px-6">
                    <span
                      className={
                        row.highlight
                          ? "font-bold text-primary"
                          : "font-semibold text-text-primary"
                      }
                    >
                      {row.label}
                    </span>
                    {row.highlight && (
                      <span className="ml-2 inline-block rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white">
                        추천
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-5 text-text-primary sm:px-6">
                    {row.cost}
                  </td>
                  <td className="hidden px-4 py-5 text-text-secondary sm:table-cell sm:px-6">
                    {row.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p
          className="mt-6 text-xs leading-relaxed text-text-secondary sm:text-sm"
          style={{ wordBreak: "keep-all" }}
        >
          {note}
        </p>
      </div>
    </section>
  )
}
