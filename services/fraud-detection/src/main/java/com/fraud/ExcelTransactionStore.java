package com.fraud;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * A tiny "database" for transactions, backed by a single Excel (.xlsx) file.
 *
 * This is deliberately simple: the whole table is kept in memory and the
 * entire workbook is rewritten to disk after every write. That's fine for a
 * demo or a small dataset (hundreds to low thousands of rows). It is NOT how
 * you'd persist a real, high-volume ledger:
 *   - every write re-serializes the whole file, so it gets slower as the
 *     table grows
 *   - there's no transaction log / WAL, so a crash mid-write can corrupt
 *     the file
 *   - no indexing, no concurrent multi-process access
 * Swap this class out for a real database (Postgres, H2, etc.) via Spring
 * Data once this needs to be more than a dummy store.
 */
public class ExcelTransactionStore {

    private static final String[] HEADERS = {
            "transactionId", "userName", "amount", "timestamp", "fraud", "fraudReason"
    };

    private final Path filePath;
    private final List<Transaction> transactions = new ArrayList<>();
    private final Object lock = new Object();
    private final AtomicLong idGenerator = new AtomicLong(1);

    public ExcelTransactionStore(String filePath) {
        this.filePath = Paths.get(filePath);
        load();
    }

    // ---------------------------------------------------------------
    // Public API — all of this is safe to call concurrently.
    // ---------------------------------------------------------------

    public List<Transaction> findAll() {
        synchronized (lock) {
            return new ArrayList<>(transactions);
        }
    }

    public Optional<Transaction> findById(long id) {
        synchronized (lock) {
            return transactions.stream()
                    .filter(t -> t.getTransactionId() == id)
                    .findFirst();
        }
    }

    public List<Transaction> findByUser(String userName) {
        synchronized (lock) {
            return transactions.stream()
                    .filter(t -> t.getUserName().equalsIgnoreCase(userName))
                    .collect(Collectors.toList());
        }
    }

    /**
     * Assigns an id and timestamp if missing, runs {@code assessor} against
     * a consistent snapshot of the existing rows (so duplicate-ID and
     * rapid-activity checks aren't racing another write), stamps the result
     * onto the transaction, appends it, and persists the whole table to the
     * Excel file — all inside one lock, so this is the atomic "insert" for
     * this store.
     */
    public Transaction addWithAssessment(Transaction t, Function<List<Transaction>, List<String>> assessor) {
        synchronized (lock) {
            if (t.getTransactionId() == 0) {
                t.setTransactionId(idGenerator.getAndIncrement());
            } else {
                idGenerator.updateAndGet(current -> Math.max(current, t.getTransactionId() + 1));
            }
            if (t.getTimestamp() == null) {
                t.setTimestamp(Instant.now());
            }

            List<String> reasons = assessor.apply(transactions);
            t.setFraud(!reasons.isEmpty());
            t.setFraudReason(String.join(", ", reasons));

            transactions.add(t);
            persist();
            return t;
        }
    }

    // ---------------------------------------------------------------
    // Excel I/O — callers must hold `lock` (all public methods do).
    // ---------------------------------------------------------------

    private void load() {
        synchronized (lock) {
            transactions.clear();

            if (!Files.exists(filePath)) {
                persist(); // creates a fresh workbook with just the header row
                return;
            }

            try (InputStream in = Files.newInputStream(filePath);
                 Workbook workbook = WorkbookFactory.create(in)) {

                Sheet sheet = workbook.getSheetAt(0);
                long maxId = 0;

                for (Row row : sheet) {
                    if (row.getRowNum() == 0) continue; // header row
                    if (row.getCell(0) == null) continue; // skip blank rows

                    Transaction t = new Transaction();
                    t.setTransactionId((long) row.getCell(0).getNumericCellValue());
                    t.setUserName(row.getCell(1).getStringCellValue());
                    t.setAmount(new BigDecimal(row.getCell(2).getStringCellValue()));
                    t.setTimestamp(Instant.parse(row.getCell(3).getStringCellValue()));
                    t.setFraud(row.getCell(4).getBooleanCellValue());

                    Cell reasonCell = row.getCell(5);
                    t.setFraudReason(reasonCell == null ? "" : reasonCell.getStringCellValue());

                    transactions.add(t);
                    maxId = Math.max(maxId, t.getTransactionId());
                }

                idGenerator.set(maxId + 1);

            } catch (IOException e) {
                throw new IllegalStateException("Could not read transactions file: " + filePath, e);
            }
        }
    }

    private void persist() {
        // Must be called while already holding `lock`.
        try (Workbook workbook = new XSSFWorkbook()) {
            Sheet sheet = workbook.createSheet("Transactions");

            Row header = sheet.createRow(0);
            for (int i = 0; i < HEADERS.length; i++) {
                header.createCell(i).setCellValue(HEADERS[i]);
            }

            int rowNum = 1;
            for (Transaction t : transactions) {
                Row row = sheet.createRow(rowNum++);
                row.createCell(0).setCellValue(t.getTransactionId());
                row.createCell(1).setCellValue(t.getUserName());
                // Written as text rather than a numeric cell: Excel's numeric
                // type is a double, which can quietly round currency amounts.
                // Text preserves the exact BigDecimal value on the round trip.
                row.createCell(2).setCellValue(t.getAmount().toPlainString());
                row.createCell(3).setCellValue(t.getTimestamp().toString());
                row.createCell(4).setCellValue(t.isFraud());
                row.createCell(5).setCellValue(t.getFraudReason() == null ? "" : t.getFraudReason());
            }

            for (int i = 0; i < HEADERS.length; i++) {
                sheet.autoSizeColumn(i);
            }

            if (filePath.getParent() != null) {
                Files.createDirectories(filePath.getParent());
            }
            try (OutputStream out = Files.newOutputStream(filePath)) {
                workbook.write(out);
            }

        } catch (IOException e) {
            throw new IllegalStateException("Could not write transactions file: " + filePath, e);
        }
    }
}
