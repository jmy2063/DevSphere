package com.devsphere.ax.api;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import java.time.Instant;

@RestControllerAdvice
public class ErrorHandler {
    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiError badRequest(Exception e, HttpServletRequest req) {
        return error(HttpStatus.BAD_REQUEST, "BAD_REQUEST", safe(e), req);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiError validation(MethodArgumentNotValidException e, HttpServletRequest req) {
        String message = e.getBindingResult().getFieldErrors().stream().findFirst()
                .map(x -> x.getField() + ": " + x.getDefaultMessage()).orElse("Validation failed.");
        return error(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", message, req);
    }


    @ExceptionHandler({
            org.springframework.http.converter.HttpMessageNotReadableException.class,
            org.springframework.web.multipart.support.MissingServletRequestPartException.class,
            org.springframework.web.bind.MissingServletRequestParameterException.class
    })
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiError malformedRequest(Exception e, HttpServletRequest req) {
        return error(HttpStatus.BAD_REQUEST, "MALFORMED_REQUEST", "Request body or required request field is missing/invalid.", req);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    @ResponseStatus(HttpStatus.PAYLOAD_TOO_LARGE)
    public ApiError tooLarge(Exception e, HttpServletRequest req) {
        return error(HttpStatus.PAYLOAD_TOO_LARGE, "UPLOAD_TOO_LARGE", "Upload exceeds the configured size limit.", req);
    }

    @ExceptionHandler(ExternalServiceException.class)
    @ResponseStatus(HttpStatus.BAD_GATEWAY)
    public ApiError external(ExternalServiceException e, HttpServletRequest req) {
        return error(HttpStatus.BAD_GATEWAY, "EXTERNAL_SERVICE_ERROR", safe(e), req);
    }

    @ExceptionHandler(java.io.IOException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiError io(java.io.IOException e, HttpServletRequest req) {
        return error(HttpStatus.BAD_REQUEST, "INVALID_PROJECT_ARCHIVE", safe(e), req);
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ApiError other(Exception e, HttpServletRequest req) {
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Unexpected server error. Check server logs for details.", req);
    }

    private ApiError error(HttpStatus status, String code, String message, HttpServletRequest req) {
        return new ApiError(Instant.now(), status.value(), code, message, req.getRequestURI());
    }

    private String safe(Exception e) {
        String m = e.getMessage();
        return m == null || m.isBlank() ? e.getClass().getSimpleName() : m.replaceAll("[\\r\\n]+", " ");
    }
}
