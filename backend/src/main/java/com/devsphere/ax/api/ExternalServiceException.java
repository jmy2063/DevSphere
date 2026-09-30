package com.devsphere.ax.api;

public class ExternalServiceException extends RuntimeException {
    private static final long serialVersionUID = 1L;
    public ExternalServiceException(String message) { super(message); }
    public ExternalServiceException(String message, Throwable cause) { super(message, cause); }
}
