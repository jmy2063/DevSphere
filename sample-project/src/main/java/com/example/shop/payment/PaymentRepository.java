package com.example.shop.payment;

import org.springframework.stereotype.Repository;

@Repository
public interface PaymentRepository {
    PaymentEntity savePayment();
}
