package com.example.shop.payment;

import jakarta.persistence.*;

@Entity
@Table(name="payments")
public class PaymentEntity {
    @Id private Long id;
}
