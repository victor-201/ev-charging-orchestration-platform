import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../bloc/auth_bloc.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/design_system/widgets/ev_toast.dart';
import '../../../../core/utils/date_utils.dart' as ev_date;
import '../widgets/auth_layout.dart';

/// High-Fidelity User Registration Screen
/// APIs: [01] POST /auth/register
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _fullNameController = TextEditingController();
  DateTime? _dateOfBirth;
  bool _obscurePassword = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _fullNameController.dispose();
    super.dispose();
  }

  Future<void> _pickDateOfBirth() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now().subtract(const Duration(days: 365 * 20)),
      firstDate: DateTime(1924),
      lastDate: DateTime.now(),
      locale: const Locale('vi', 'VN'),
      helpText: 'Chọn ngày sinh',
    );
    if (picked != null) {
      setState(() => _dateOfBirth = picked);
    }
  }

  void _submit() {
    if (_formKey.currentState?.validate() ?? false) {
      if (_dateOfBirth == null) {
        EVToast.show(context, message: 'Vui lòng chọn ngày sinh', isError: true);
        return;
      }
      if (!ev_date.DateUtils.isAtLeast18(_dateOfBirth!)) {
        EVToast.show(context, message: 'Bạn phải đủ 18 tuổi để đăng ký', isError: true);
        return;
      }
      context.read<AuthBloc>().add(AuthRegisterRequested(
            email: _emailController.text.trim(),
            password: _passwordController.text,
            fullName: _fullNameController.text.trim(),
            dateOfBirth: _dateOfBirth!,
          ));
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthLayout(
      onBackPressed: () => context.go('/welcome'),
      child: BlocConsumer<AuthBloc, AuthState>(
        listener: (context, state) {
          if (state is AuthEmailVerificationRequired) {
            context.go('/auth/verify-email?email=${Uri.encodeComponent(state.email)}');
          } else if (state is AuthError) {
            EVToast.show(context, message: state.message, isError: true);
          }
        },
        builder: (context, state) {
          return Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                    Text(
                      'Bắt đầu hành trình',
                      style: AppTypography.headingLg.copyWith(
                        color: Theme.of(context).colorScheme.onSurface,
                        fontWeight: FontWeight.w700,
                        fontSize: 22,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      'Đăng ký ngay để trải nghiệm mạng lưới sạc thông minh.',
                      style: AppTypography.caption.copyWith(
                        color: AppColors.grey600,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xl),


                  // Full name input form
                  TextFormField(
                    controller: _fullNameController,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(
                      labelText: 'Họ và tên *',
                      prefixIcon: Icon(Icons.person_outlined),
                    ),
                    validator: (v) => v == null || v.trim().isEmpty
                        ? 'Vui lòng nhập họ tên'
                        : null,
                  ),
                  const SizedBox(height: AppSpacing.md),

                  // Email
                  TextFormField(
                    controller: _emailController,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(
                      labelText: 'Email *',
                      hintText: 'example@email.com',
                      prefixIcon: Icon(Icons.email_outlined),
                    ),
                    validator: (v) {
                      if (v == null || v.isEmpty) return 'Vui lòng nhập email';
                      final re = RegExp(
                          r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$');
                      if (!re.hasMatch(v.trim())) return 'Email không hợp lệ';
                      return null;
                    },
                  ),
                  const SizedBox(height: AppSpacing.md),

                  // Password credentials form
                  TextFormField(
                    controller: _passwordController,
                    obscureText: _obscurePassword,
                    textInputAction: TextInputAction.next,
                    decoration: InputDecoration(
                      labelText: 'Mật khẩu *',
                      prefixIcon: const Icon(Icons.lock_outlined),
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscurePassword
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                        ),
                        onPressed: () => setState(
                            () => _obscurePassword = !_obscurePassword),
                      ),
                    ),
                    validator: (v) {
                      if (v == null || v.isEmpty) {
                        return 'Vui lòng nhập mật khẩu';
                      }
                      if (v.length < 8) {
                        return 'Mật khẩu phải có ít nhất 8 ký tự';
                      }
                      return null;
                    },
                  ),

                  const SizedBox(height: AppSpacing.md),

                  // Birthdate selector input
                  GestureDetector(
                    onTap: _pickDateOfBirth,
                    child: AbsorbPointer(
                      child: TextFormField(
                        decoration: InputDecoration(
                          labelText: 'Ngày sinh *',
                          prefixIcon: const Icon(Icons.calendar_today_outlined),
                          hintText: _dateOfBirth == null
                              ? 'dd/mm/yyyy'
                              : ev_date.DateUtils.formatDate(_dateOfBirth!),
                        ),
                        controller: TextEditingController(
                          text: _dateOfBirth == null
                              ? ''
                              : ev_date.DateUtils.formatDate(_dateOfBirth!),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    'Bạn phải đủ 18 tuổi để sử dụng ứng dụng.',
                    style: AppTypography.caption.copyWith(
                      color: AppColors.grey600,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xl),

                  EVButton(
                    label: 'Tạo tài khoản',
                    onPressed: _submit,
                    isLoading: state is AuthLoading,
                  ),
                  const SizedBox(height: AppSpacing.lg),

                  Center(
                    child: Wrap(
                      alignment: WrapAlignment.center,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(
                          'Đã có tài khoản? ',
                          style: AppTypography.bodyMd.copyWith(
                            color: AppColors.grey600,
                          ),
                        ),
                        TextButton(
                          onPressed: () => context.push('/auth/login'),
                          style: TextButton.styleFrom(
                            padding: EdgeInsets.zero,
                            minimumSize: Size.zero,
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                          child: Text(
                            'Đăng nhập',
                            style: AppTypography.bodyMd.copyWith(
                              color: AppColors.primary,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
            ),
          );
        },
      ),
    );
  }
}
