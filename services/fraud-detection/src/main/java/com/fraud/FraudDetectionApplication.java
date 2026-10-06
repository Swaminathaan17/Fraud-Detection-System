package com.fraud;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@SpringBootApplication
@RestController
@RequestMapping("/api")
// "*" allows any site to call this API from a browser. Fine for local dev;
// in production, list your actual frontend origin(s) instead.
@CrossOrigin("*")
public class FraudDetectionApplication {

    private static final BigDecimal HIGH_AMOUNT_THRESHOLD = new BigDecimal("100000");
    private static final BigDecimal MEDIUM_AMOUNT_THRESHOLD = new BigDecimal("50000");
    private static final int RAPID_ACTIVITY_COUNT = 5;
    private static final long RAPID_ACTIVITY_WINDOW_SECONDS = 60;

    // Dummy DB: transactions are persisted to this Excel file instead of an
    // in-memory-only list, so data survives a restart. Defaults to
    // ./data/transactions.xlsx relative to wherever the app is run from;
    // override with -Dtransactions.file=/some/other/path.xlsx
    private final ExcelTransactionStore store =
            new ExcelTransactionStore(System.getProperty("transactions.file", "data/transactions.xlsx"));

    public static void main(String[] args) {
        SpringApplication.run(FraudDetectionApplication.class, args);
    }

    // =========================
    // ADD TRANSACTION
    // =========================
    @PostMapping("/transactions")
    public ResponseEntity<Transaction> addTransaction(@RequestBody Transaction t) {
        validate(t);
        Transaction saved = store.addWithAssessment(t, existing -> assess(t, existing));
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    private List<String> assess(Transaction t, List<Transaction> existing) {
        List<String> reasons = new ArrayList<>();

        if (t.getAmount().compareTo(HIGH_AMOUNT_THRESHOLD) > 0) {
            reasons.add("Amount exceeds Rs.1,00,000");
        } else if (t.getAmount().compareTo(MEDIUM_AMOUNT_THRESHOLD) > 0) {
            reasons.add("Amount exceeds Rs.50,000");
        }

        boolean duplicate = existing.stream()
                .anyMatch(tx -> tx.getTransactionId() == t.getTransactionId());
        if (duplicate) {
            reasons.add("Duplicate Transaction ID");
        }

        // Rapid activity = N+ transactions from the same user within the
        // trailing window, not a lifetime count.
        Instant windowStart = t.getTimestamp().minus(RAPID_ACTIVITY_WINDOW_SECONDS, ChronoUnit.SECONDS);
        long recentCount = existing.stream()
                .filter(tx -> tx.getUserName().equalsIgnoreCase(t.getUserName()))
                .filter(tx -> !tx.getTimestamp().isBefore(windowStart))
                .count();
        if (recentCount + 1 >= RAPID_ACTIVITY_COUNT) {
            reasons.add("Rapid Activity (" + (recentCount + 1) + " transactions in "
                    + RAPID_ACTIVITY_WINDOW_SECONDS + "s)");
        }

        return reasons;
    }

    // =========================
    // GET ALL
    // =========================
    @GetMapping("/transactions")
    public List<Transaction> getTransactions() {
        return store.findAll();
    }

    // =========================
    // GET ONE
    // =========================
    @GetMapping("/transactions/{id}")
    public Transaction getTransaction(@PathVariable long id) {
        return store.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No transaction with id " + id));
    }

    // =========================
    // GET BY USER
    // =========================
    @GetMapping("/transactions/user/{userName}")
    public List<Transaction> getTransactionsByUser(@PathVariable String userName) {
        return store.findByUser(userName);
    }

    // =========================
    // GET FRAUD
    // =========================
    @GetMapping("/fraud")
    public List<Transaction> getFraudTransactions() {
        return store.findAll().stream()
                .filter(Transaction::isFraud)
                .collect(Collectors.toList());
    }

    // =========================
    // STATISTICS
    // =========================
    @GetMapping("/statistics")
    public Map<String, Object> statistics() {
        List<Transaction> all = store.findAll();
        Map<String, Object> map = new HashMap<>();

        int total = all.size();
        int fraud = (int) all.stream().filter(Transaction::isFraud).count();

        BigDecimal totalAmount = all.stream()
                .map(Transaction::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal fraudAmount = all.stream()
                .filter(Transaction::isFraud)
                .map(Transaction::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        map.put("total", total);
        map.put("fraud", fraud);
        map.put("safe", total - fraud);
        map.put("totalAmount", totalAmount);
        map.put("fraudAmount", fraudAmount);
        map.put("fraudRatePercent", total == 0
                ? BigDecimal.ZERO
                : new BigDecimal(fraud).multiply(new BigDecimal("100"))
                    .divide(new BigDecimal(total), 2, RoundingMode.HALF_UP));

        return map;
    }

    // =========================
    // VALIDATION
    // =========================
    private void validate(Transaction t) {
        if (t == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Request body is required");
        }
        if (t.getUserName() == null || t.getUserName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "userName is required");
        }
        if (t.getAmount() == null || t.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "amount must be greater than 0");
        }
        if (t.getTransactionId() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "transactionId cannot be negative");
        }
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> handleBadRequest(ResponseStatusException ex) {
        return ResponseEntity.status(ex.getStatusCode())
                .body(Map.of("error", ex.getReason() == null ? "Bad request" : ex.getReason()));
    }
}
