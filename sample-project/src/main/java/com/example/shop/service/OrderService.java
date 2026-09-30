package com.example.shop.service;

import com.example.shop.repository.OrderRepository;
import com.example.shop.payment.PaymentService;
import com.example.shop.inventory.InventoryService;
import com.example.shop.audit.AuditService;
import org.springframework.stereotype.Service;

@Service
public class OrderService {
    private final OrderRepository orderRepository;
    private final PaymentService paymentService;
    private final InventoryService inventoryService;
    private final AuditService auditService;

    public OrderService(OrderRepository orderRepository, PaymentService paymentService,
                        InventoryService inventoryService, AuditService auditService) {
        this.orderRepository = orderRepository;
        this.paymentService = paymentService;
        this.inventoryService = inventoryService;
        this.auditService = auditService;
    }

    public Object createOrder() {
        inventoryService.reserve();
        paymentService.pay();
        auditService.recordOrderCreated();
        return orderRepository.save(new Object());
    }

    public void deleteOrder(Long id) {
        orderRepository.deleteById(id);
        auditService.recordOrderDeleted();
    }
}
