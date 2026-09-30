package com.example.shop.payment;

import org.springframework.stereotype.Service;

@Service
public class PaymentService {
    private final PaymentRepository paymentRepository;
    private final com.example.shop.audit.AuditService auditService;

    public PaymentService(PaymentRepository paymentRepository, com.example.shop.audit.AuditService auditService) {
        this.paymentRepository = paymentRepository;
        this.auditService = auditService;
    }

    public void pay() {
        paymentRepository.savePayment();
        auditService.recordPayment();
    }

    /** Overload intentionally kept to verify method-call arity disambiguation. */
    public void pay(String channel) {
        auditService.recordPayment();
    }
}
