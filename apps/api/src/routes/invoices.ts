/**
 * invoices.ts — Employer invoice generation and PDF receipt download
 *
 * Routes:
 *  GET  /api/employers/invoices               — paginated invoice index (employer)
 *  GET  /api/employers/invoices/:jobId/pdf    — stream PDF invoice for a completed job
 *  POST /api/admin/invoices/bulk-generate     — admin batch generate invoice records
 */

import PDFDocument from "pdfkit"
import { FastifyInstance } from "fastify"
import { eq, and, desc, lt } from "drizzle-orm"
import { db, jobPostings, payments, employerProfiles, users } from "../db"
import { requireEmployer, requireAdmin } from "../middleware/auth"

// ── helpers ───────────────────────────────────────────────────────────────────

/** Invoice number: INV-<first-8-chars-of-jobId>-<YYYYMMDD> */
function buildInvoiceNumber(jobId: string, date: Date): string {
  const shortId = jobId.replace(/-/g, "").slice(0, 8).toUpperCase()
  const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, "")
  return `INV-${shortId}-${yyyymmdd}`
}

/** Korean Won formatter */
function formatKRW(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`
}

// ── route registration ────────────────────────────────────────────────────────

export async function invoiceRoutes(app: FastifyInstance) {
  // ── GET /api/employers/invoices ─────────────────────────────────────────────
  app.get(
    "/api/employers/invoices",
    { preHandler: [requireEmployer] },
    async (request, reply) => {
      const userId = (request as any).user?.userId as string
      const { limit = "20", cursor } = request.query as {
        limit?: string
        cursor?: string
      }
      const pageSize = Math.min(parseInt(limit, 10) || 20, 100)

      // Fetch completed job postings for this employer (that have payments)
      const rows = await db
        .select({
          id: jobPostings.id,
          title: jobPostings.title,
          completedAt: jobPostings.completedAt,
          totalAmount: jobPostings.totalAmount,
          escrowStatus: jobPostings.escrowStatus,
          paymentStatus: jobPostings.paymentStatus,
          invoiceDownloadedAt: jobPostings.invoiceDownloadedAt,
          createdAt: jobPostings.createdAt,
        })
        .from(jobPostings)
        .where(
          and(
            eq(jobPostings.employerId, userId),
            eq(jobPostings.status, "completed")
          )
        )
        .orderBy(desc(jobPostings.completedAt))
        .limit(pageSize + 1)

      const hasMore = rows.length > pageSize
      const items = hasMore ? rows.slice(0, pageSize) : rows
      const nextCursor = hasMore ? items[items.length - 1]!.id : null

      const invoices = items.map((job) => {
        const refDate = job.completedAt ?? job.createdAt
        return {
          jobId: job.id,
          jobTitle: job.title,
          invoiceNumber: buildInvoiceNumber(job.id, refDate),
          totalAmount: job.totalAmount,
          escrowStatus: job.escrowStatus,
          paymentStatus: job.paymentStatus,
          generatedAt: refDate.toISOString(),
          downloadedAt: job.invoiceDownloadedAt?.toISOString() ?? null,
          downloadUrl: `/api/employers/invoices/${job.id}/pdf`,
        }
      })

      return reply.send({ data: invoices, nextCursor, count: invoices.length })
    }
  )

  // ── GET /api/employers/invoices/:jobId/pdf ──────────────────────────────────
  app.get(
    "/api/employers/invoices/:jobId/pdf",
    { preHandler: [requireEmployer] },
    async (request, reply) => {
      const userId = (request as any).user?.userId as string
      const { jobId } = request.params as { jobId: string }

      // Load job posting
      const [job] = await db
        .select()
        .from(jobPostings)
        .where(and(eq(jobPostings.id, jobId), eq(jobPostings.employerId, userId)))
        .limit(1)

      if (!job) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Invoice not found" } })
      }

      if (job.status !== "completed" && job.status !== "in_progress") {
        return reply
          .status(404)
          .send({ error: { code: "NOT_COMPLETED", message: "Job must be completed to generate invoice" } })
      }

      // Load employer profile for company name
      const [employer] = await db
        .select({ companyName: employerProfiles.companyName })
        .from(employerProfiles)
        .where(eq(employerProfiles.userId, userId))
        .limit(1)

      // Load payment record
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.jobId, jobId))
        .limit(1)

      const invoiceDate = job.completedAt ?? new Date()
      const invoiceNumber = buildInvoiceNumber(job.id, invoiceDate)
      const companyName = employer?.companyName ?? "고용주"
      const vatRate = 0.10
      const baseAmount = payment?.amount ?? job.totalAmount
      const platformFee = payment?.platformFee ?? Math.round(job.totalAmount * 0.05)
      const vatAmount = Math.round(platformFee * vatRate)
      const netPayout = baseAmount - platformFee
      const totalWithVat = platformFee + vatAmount

      // Mark as downloaded
      await db
        .update(jobPostings)
        .set({ invoiceDownloadedAt: new Date(), updatedAt: new Date() })
        .where(eq(jobPostings.id, jobId))

      // Generate PDF
      const doc = new PDFDocument({ size: "A4", margin: 50 })

      reply.raw.setHeader("Content-Type", "application/pdf")
      reply.raw.setHeader(
        "Content-Disposition",
        `attachment; filename="invoice-${invoiceNumber}.pdf"`
      )
      doc.pipe(reply.raw)

      // ── Header ──
      doc
        .fontSize(24)
        .font("Helvetica-Bold")
        .text("AlbaConnect", 50, 50)
        .fontSize(11)
        .font("Helvetica")
        .text("단기 알바 매칭 플랫폼", 50, 80)
        .text("contact@albaconnect.kr | albaconnect.kr", 50, 95)

      // Invoice title
      doc
        .fontSize(20)
        .font("Helvetica-Bold")
        .text("세금계산서 (INVOICE)", { align: "right" })
        .moveDown(0.3)

      // Invoice meta
      doc
        .fontSize(11)
        .font("Helvetica")
        .text(`청구서 번호: ${invoiceNumber}`, { align: "right" })
        .text(`발행일: ${invoiceDate.toLocaleDateString("ko-KR")}`, { align: "right" })
        .moveDown(1)

      // Divider
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke().moveDown(0.5)

      // Bill to
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .text("청구 대상:", 50)
        .font("Helvetica")
        .text(companyName, 50)
        .text(`고용주 ID: ${userId.slice(0, 8)}...`, 50)
        .moveDown(1)

      // Job detail section
      doc
        .fontSize(12)
        .font("Helvetica-Bold")
        .text("업무 내역", 50)
        .moveDown(0.3)

      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke().moveDown(0.3)

      // Table header
      const tableTop = doc.y
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .text("업무 제목", 50, tableTop)
        .text("근무 기간", 250, tableTop)
        .text("금액", 450, tableTop, { width: 95, align: "right" })
        .moveDown(0.4)

      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#dddddd").stroke().moveDown(0.3)

      // Table row
      const startStr = job.startAt.toLocaleDateString("ko-KR")
      const endStr = job.endAt.toLocaleDateString("ko-KR")
      doc
        .fontSize(10)
        .font("Helvetica")
        .text(job.title, 50, doc.y, { width: 190 })
        .text(`${startStr} ~ ${endStr}`, 250, doc.y - doc.currentLineHeight(), { width: 190 })
        .text(formatKRW(baseAmount), 450, doc.y - doc.currentLineHeight(), {
          width: 95,
          align: "right",
        })
        .moveDown(0.8)

      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke().moveDown(0.5)

      // Summary
      const summaryX = 350
      const valueX = 450
      const summaryWidth = 95

      const addSummaryLine = (label: string, value: string, bold = false) => {
        const y = doc.y
        doc
          .fontSize(10)
          .font(bold ? "Helvetica-Bold" : "Helvetica")
          .text(label, summaryX, y)
          .text(value, valueX, y, { width: summaryWidth, align: "right" })
          .moveDown(0.4)
      }

      addSummaryLine("소계 (총 지불액):", formatKRW(baseAmount))
      addSummaryLine("플랫폼 수수료 (5%):", formatKRW(platformFee))
      addSummaryLine(`부가세 VAT (10%)    :`, formatKRW(vatAmount))
      addSummaryLine("작업자 정산 금액:", formatKRW(netPayout))

      doc.moveDown(0.3)
      doc
        .moveTo(summaryX, doc.y)
        .lineTo(545, doc.y)
        .strokeColor("#333333")
        .stroke()
        .moveDown(0.3)
      addSummaryLine("플랫폼 청구 합계:", formatKRW(totalWithVat), true)

      doc.moveDown(1.5)

      // Footer
      doc
        .fontSize(9)
        .fillColor("#888888")
        .font("Helvetica")
        .text(
          "본 세금계산서는 AlbaConnect 플랫폼에서 자동 발행되었습니다. 문의: contact@albaconnect.kr",
          50,
          doc.page.height - 80,
          { align: "center", width: 495 }
        )

      doc.end()

      return reply
    }
  )

  // ── POST /api/admin/invoices/bulk-generate ─────────────────────────────────
  app.post(
    "/api/admin/invoices/bulk-generate",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const { from, to } = request.query as { from?: string; to?: string }

      const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const toDate = to ? new Date(to) : new Date()

      // Count completed jobs without downloaded invoices in the date range
      const rows = await db
        .select({ id: jobPostings.id, completedAt: jobPostings.completedAt })
        .from(jobPostings)
        .where(
          and(
            eq(jobPostings.status, "completed"),
            lt(jobPostings.completedAt, toDate)
          )
        )

      const eligible = rows.filter(
        (r) => r.completedAt && r.completedAt >= fromDate && r.completedAt <= toDate
      )

      // Return the count and download URLs (actual PDFs are generated on-demand)
      const invoices = eligible.map((r) => ({
        jobId: r.id,
        invoiceNumber: buildInvoiceNumber(r.id, r.completedAt!),
        downloadUrl: `/api/employers/invoices/${r.id}/pdf`,
      }))

      return reply.send({
        count: invoices.length,
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        invoices,
      })
    }
  )
}
