package com.example.shop.audit;

import org.springframework.stereotype.Service;

@Service
public class AuditService {
    public void recordOrderCreated() {}
    public void recordOrderDeleted() {}
    public void recordPayment() {}
}
