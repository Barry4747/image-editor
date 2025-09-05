from rest_framework import permissions


class IsOwnerOrGuest(permissions.BasePermission):
    """
    Allow access if:
    - user is authenticated and owns the Job
    - OR guest with matching session_id
    """

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        if request.user.is_authenticated:
            return obj.user == request.user
        session_id = request.headers.get("X-Session-ID")
        return session_id and obj.session_id == session_id