namespace EKilitBoard;

static class Program
{
    [STAThread]
    static void Main()
    {
        // Tek instance kontrolü
        using var mutex = new Mutex(true, "EKilitBoard_SingleInstance", out bool isNew);
        if (!isNew)
        {
            MessageBox.Show("E-Kilit zaten çalışıyor.", "E-Kilit", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new LockScreenForm());
    }
}